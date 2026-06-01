const { execSync } = require('child_process');

const now = Date.now();
const toUpdate = [];
const summary = [];

// Helper function to make sure we only upgrade, never downgrade
function isNewer(versionA, versionB) {
  const a = versionA.split('.').map(Number);
  const b = versionB.split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const numA = a[i] || 0;
    const numB = b[i] || 0;
    if (numA > numB) return true;
    if (numA < numB) return false;
  }
  return false;
}

console.log('Running "pnpm outdated" to find available updates...\n');

let outdatedData = {};
try {
  // pnpm outdated exits with an error code if there are updates, so we must catch it
  const output = execSync('pnpm outdated --json', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
  outdatedData = JSON.parse(output);
} catch (err) {
  if (err.stdout) {
    outdatedData = JSON.parse(err.stdout.toString());
  }
}

// If it's empty, everything is perfectly up to date
if (Object.keys(outdatedData).length === 0) {
  console.log('No outdated packages found by pnpm!');
  process.exit(0);
}

console.log('Checking release dates for outdated packages...\n');

for (const [name, details] of Object.entries(outdatedData)) {
  const currentVersion = details.current;
  if (!currentVersion) continue; // Skip if it's somehow not installed

  try {
    // Use pnpm view to get the release dates for this specific package
    const timeJson = execSync(`pnpm view "${name}" time --json`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    const times = JSON.parse(timeJson);

    // Filter out metadata and unstable versions (like betas or alphas)
    const versions = Object.keys(times)
      .filter(v => v !== 'modified' && v !== 'created')
      .filter(v => !v.includes('-'));

    // Sort from newest to oldest
    versions.sort((a, b) => new Date(times[b]).getTime() - new Date(times[a]).getTime());

    let targetVersion = null;
    let daysOld = 0;
    let versionDelta = 0;

    // Find the first version that is at least 14 days old
    for (const v of versions) {
      const publishTime = new Date(times[v]).getTime();
      daysOld = Math.floor((now - publishTime) / (1000 * 60 * 60 * 24));

      if (daysOld >= 7) {
        targetVersion = v;
        break;
      } else {
        console.log(`  [SKIP]  ${name}@${v}: too new to use (age: ${daysOld})`);
        versionDelta++;
      }
    }

    if (targetVersion) {
      // Check if the 14-day-old version is actually newer than what you have right now
      if (isNewer(targetVersion, currentVersion)) {
        toUpdate.push(`${name}@${targetVersion}`);
        console.log(`[READY] ${name}: upgrading v${currentVersion} -> v${targetVersion} (${daysOld} days old)`);
        summary.push({
          'Package': name,
          'Current': currentVersion,
          'Target': targetVersion,
          'Status': versionDelta ? `READY (-${versionDelta})` : 'READY',
          'Age (days)': daysOld,
        });
      } else {
        console.log(`[SKIP]  ${name}: latest safe version (v${targetVersion}) is too new to use`);
        summary.push({
          'Package': name,
          'Current': currentVersion,
          'Target': targetVersion,
          'Status': 'SKIP (Too New)',
          'Age (days)': daysOld,
        });
      }
    } else {
      console.log(`[SKIP]  ${name}: could not find a stable version older than 7 days`);
      summary.push({
        'Package': name,
        'Current': currentVersion,
        'Target': 'N/A',
        'Status': 'SKIP (No stable >7d)',
        'Age (days)': '-',
      });
    }
  } catch (err) {
    console.error(`[ERROR] Could not check ${name}`);
    summary.push({
      'Package': name,
      'Current': currentVersion,
      'Target': 'ERROR',
      'Status': 'Failed to check',
      'Age (days)': '-',
    });
  }
}

console.log('\n---');
console.table(summary);
console.log('\n');
console.log('\n---');
if (toUpdate.length > 0) {
  console.log('Run this command to update:');
  console.log(`pnpm up ${toUpdate.join(' ')}`);
} else {
  console.log('Everything is up to date based on your 2-week rule!');
}

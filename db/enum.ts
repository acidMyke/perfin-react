function mapToConstants<Tuples extends readonly string[]>(tuples: Tuples) {
  return tuples.reduce(
    (acc, val) => {
      // @ts-expect-error
      acc[val.toUpperCase()] = val;
      return acc;
    },
    {} as { [P in Tuples[number] as Uppercase<P>]: P },
  );
}

export const SUBJECT_TYPES_TUPLE = ['account', 'category'] as const;
export type SubjectType = (typeof SUBJECT_TYPES_TUPLE)[number];
export const SubjectTypeConst = mapToConstants(SUBJECT_TYPES_TUPLE);

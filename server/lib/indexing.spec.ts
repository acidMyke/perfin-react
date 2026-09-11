import { nanoid } from 'nanoid';
import { generateSearchChunks, createGetTextId, getGeoCellId, type TextIdParamter } from './indexing';

describe(getGeoCellId, () => {
  it('should create an determinstic id based on the input', () => {
    expect.soft(getGeoCellId({ latitude: 1.391389, longitude: 103.8769 })).toMatchInlineSnapshot(`69551938`);
    expect.soft(getGeoCellId({ latitude: 1.302563, longitude: 103.684676 })).toMatchInlineSnapshot(`65151842`);
    expect.soft(getGeoCellId({ latitude: 1.384888, longitude: 103.827751 })).toMatchInlineSnapshot(`69251913`);
    expect.soft(getGeoCellId({ latitude: 1.371579, longitude: 103.626539 })).toMatchInlineSnapshot(`68551813`);
  });
});

describe(createGetTextId, () => {
  const paramPermutations: TextIdParamter[] = [
    { userId: 'user000', kind: 'shopName', text: 'text000' },
    { userId: 'user001', kind: 'shopName', text: 'text000' },
    { userId: 'user000', kind: 'mallName', text: 'text000' },
    { userId: 'user000', kind: 'shopName', text: 'text001' },
  ];

  it('should return a method to get text id of 16 bytes', async () => {
    const param: TextIdParamter = { userId: nanoid(), kind: 'itemName', text: nanoid() };
    const getTextId = await createGetTextId(param);
    expect(getTextId).toBeInstanceOf(Function);
    const textId = getTextId(param);
    expect(textId).toBeDefined();
    expect(textId!.byteLength).toBe(16);
  });

  it('should create an determinstic id based on the input', async () => {
    const getTextId = await createGetTextId(...paramPermutations);
    const [id0, id1, id2, id3] = paramPermutations.map(getTextId);

    expect
      .soft(id0 && new Uint8Array(id0).toString())
      .toMatchInlineSnapshot(`"116,144,116,184,76,171,216,135,141,60,105,10,68,41,43,197"`);
    expect
      .soft(id1 && new Uint8Array(id1).toString())
      .toMatchInlineSnapshot(`"144,67,178,82,211,120,116,238,185,73,123,229,109,58,103,19"`);
    expect
      .soft(id2 && new Uint8Array(id2).toString())
      .toMatchInlineSnapshot(`"214,156,242,64,201,42,209,99,180,57,10,0,11,246,210,12"`);
    expect
      .soft(id3 && new Uint8Array(id3).toString())
      .toMatchInlineSnapshot(`"207,190,190,213,5,70,132,252,239,109,133,196,9,121,255,119"`);
  });

  it('should be different for when any of the input parameter change', async () => {
    const getTextId = await createGetTextId(...paramPermutations);
    const [id0, id1, id2, id3] = paramPermutations.map(getTextId);

    expect.soft(id0).not.toBe(id1);
    expect.soft(id0).not.toBe(id2);
    expect.soft(id0).not.toBe(id3);

    expect.soft(id1).not.toBe(id2);
    expect.soft(id1).not.toBe(id3);

    expect.soft(id2).not.toBe(id3);
  });
});

describe(generateSearchChunks, () => {
  it('should break up to 10 chunks per phrase', () => {
    expect
      .soft(generateSearchChunks('Worcestershire'))
      .toEqual(['w', 'wo', 'wor', 'orc', 'rce', 'ces', 'est', 'ste', 'ter', 'ers']);
  });

  it('should break up to unlimited chunks per phrase if unlimited is set to true', () => {
    expect
      .soft(generateSearchChunks('Worcestershire', { unlimited: true }))
      .toEqual(['w', 'wo', 'wor', 'orc', 'rce', 'ces', 'est', 'ste', 'ter', 'ers', 'rsh', 'shi', 'hir', 'ire']);
  });
});

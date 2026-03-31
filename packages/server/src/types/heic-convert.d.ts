declare module 'heic-convert' {
  export interface HeicConvertOptions {
    buffer: Buffer;
    format: 'JPEG' | 'PNG';
    quality?: number;
  }

  export interface HeicConvertImageHandle {
    convert: () => Promise<Uint8Array | Buffer>;
  }

  interface HeicConvertFn {
    (options: HeicConvertOptions): Promise<Uint8Array | Buffer>;
    all: (options: HeicConvertOptions) => Promise<HeicConvertImageHandle[]>;
  }

  const convert: HeicConvertFn;
  export default convert;
}

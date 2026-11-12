declare module "qrcode" {
  export function toCanvas(canvas: HTMLCanvasElement, text: string, options?: any, callback?: (err: Error | null) => void): Promise<void>;
  export function toCanvas(canvas: HTMLCanvasElement, text: string, callback?: (err: Error | null) => void): Promise<void>;
  export function toDataURL(text: string, options?: any): Promise<string>;
  export function toDataURL(text: string, options: any, callback: (err: Error | null, url: string) => void): void;
}

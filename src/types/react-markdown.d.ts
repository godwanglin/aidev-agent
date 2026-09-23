declare module 'react-markdown' {
  import type { ComponentType, ReactElement } from 'react';

  export interface Components {
    [nodeType: string]: ComponentType<any>;
  }

  export interface Options {
    children?: string | null;
    className?: string;
    remarkPlugins?: any[];
    rehypePlugins?: any[];
    components?: Partial<Components> | Record<string, ComponentType<any>>;
    urlTransform?: (url: string) => string;
    [key: string]: any;
  }

  export function ReactMarkdown(props: Options): ReactElement | null;
  export default ReactMarkdown;
}

declare module 'remark-gfm' {
  const remarkGfm: any;
  export default remarkGfm;
}

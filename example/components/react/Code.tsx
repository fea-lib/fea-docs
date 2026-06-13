import {
  Sandpack,
  SANDBOX_TEMPLATES,
  type SandpackInternal,
} from "@codesandbox/sandpack-react";

type AppType = keyof typeof SANDBOX_TEMPLATES;

type AppTemplate = {
  [K in AppType]: {
    [key in K]: {
      [F in keyof (typeof SANDBOX_TEMPLATES)[K]["files"]]?: string;
    } & {
      [key: string]: string | undefined;
    };
  };
}[AppType];

type Options = Omit<
  Parameters<SandpackInternal>[0]["options"],
  "files" | "theme" | "template"
>;

export type Props = { src: AppTemplate } & Options;

export default function Code({ src, ...options }: Props) {
  const template = Object.keys(src)[0] as AppType;
  const files = (src as Record<string, any>)[template];

  return (
    <Sandpack
      theme={theme}
      files={files}
      options={options}
    />
  );
}

export type FileContent = string;
export type FilePath = URL & { protocol: "file:" };
export type RemoteUrl = URL & { protocol: "http:" | "https:" };

export type FileResource = FileContent | FilePath | RemoteUrl;

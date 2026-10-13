export declare function hashFgPassword(password: string): Promise<string>;
export declare function verifyFgPassword({ hash, password }: {
    hash: string;
    password: string;
}): Promise<boolean>;

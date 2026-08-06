// export {} makes this a MODULE file so declare module below is a
// module AUGMENTATION (merges with next-auth's real types), not a
// module DECLARATION (which would replace them entirely).
export {};

declare module "next-auth" {
    interface Session {
        user: {
            id: string;
            name?: string | null;
            email?: string | null;
            image?: string | null;
            role: string;
        };
    }

    interface User {
        id: string;
        role: string;
    }
}

declare module "next-auth/jwt" {
    interface JWT {
        id: string;
        role: string;
    }
}

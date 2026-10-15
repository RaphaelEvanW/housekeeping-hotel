import "server-only";

import { APIError } from "better-auth/api";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";

import { db } from "@/server/db";

export const auth = betterAuth({
    baseURL: process.env.BETTER_AUTH_URL,
    secret: process.env.BETTER_AUTH_SECRET,

    database: prismaAdapter(db, {
        provider: "postgresql",
    }),

    emailAndPassword: {
        enabled: true,
        disableSignUp: true,
    },

    databaseHooks: {
        session: {
            create: {
                before: async (session) => {
                    const user = await db.user.findUnique({
                    where: { id: session.userId },
                    select: { isActive: true },
                    });

                    if (!user || !user.isActive) {
                        throw new APIError("UNAUTHORIZED", {
                            message: "Login tidak dapat diproses.",
                        });
                    }
                },
            },
        },
    },
});


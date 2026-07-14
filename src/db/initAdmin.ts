import { UserRole } from "@prisma/client";
import config from "../config";
import prisma from "./connector";
import passwordHelper from "../utils/password";

export const initiateAdmin = async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payload: any = {
    name: "Admin",
    email: config.SUPER_ADMIN_EMAIL,
    role: UserRole.ADMIN,
  };

  const hashedPassword = await passwordHelper.hashPassword("123456");

  const isExistUser = await prisma.user.findUnique({
    where: {
      email: payload.email,
    },
  });

  if (isExistUser) return;

  await prisma.user.create({
    data: { ...payload, password: hashedPassword },
  });
};

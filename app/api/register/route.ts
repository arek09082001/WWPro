import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { handleRoute, newId } from '@/lib/api/route-helpers';
import { getStore } from '@/lib/store';

const registerSchema = z.object({
  email: z.string().email('Ungültige E-Mail-Adresse'),
  password: z.string().min(6, 'Das Passwort muss mindestens 6 Zeichen haben'),
  name: z.string().max(120).optional(),
});

/** Registers a new user with a bcrypt-hashed password. */
export async function POST(request: Request) {
  return handleRoute(async () => {
    const body = registerSchema.parse(await request.json());
    const user = await getStore().createUser({
      id: newId(),
      email: body.email.trim().toLowerCase(),
      passwordHash: await bcrypt.hash(body.password, 10),
      name: body.name?.trim() || null,
      createdAt: new Date().toISOString(),
    });
    return { id: user.id, email: user.email };
  });
}

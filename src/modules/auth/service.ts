import { UserModel } from '../../models/user';
import bcrypt from 'bcryptjs';
import BaseService from '../../lib/baseService';
import { APIError } from '../../lib/APIError';
import { RegisterInput } from './schema';

class AuthService extends BaseService {
    constructor() {
        super(UserModel);
    }

    async login(email: string, password: string) {
        const user = await this.get({ email });
        if (!user) {
            throw new APIError({ code: 404, message: 'User not found' });
        }
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            throw new APIError({ code: 401, message: 'Invalid password' });
        }
        return user;
    }

    async register(input: RegisterInput) {
        const user = await this.model.create(input);
        return user;
    }
}

export const authService = new AuthService();

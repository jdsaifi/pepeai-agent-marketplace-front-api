import { Request, Response } from 'express';
import { UserModel } from '../../models/user';
import { LoginInput } from './schema';
import { dd } from '../../lib/dd';
import { sendSuccess } from '../../lib/apiResponse';
import { authService } from './service';
import Helpers from '../../lib/helpers';
import { AuthRequest } from '../../middleware/auth';

class AuthController {
    // Register
    async resgister(req: Request, res: Response) {
        const { email, password, name } = req.body;

        dd.log('register input', req.body);

        const user = await authService.register({ email, password, name });
        dd.log('register success', user);

        const token = Helpers.generateJWTToken({
            sub: user._id,
            email: user.email,
        });

        const response = {
            id: user._id,
            email: user.email,
            authToken: token,
        };

        // set cookie
        res.cookie('authToken', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 1000 * 60 * 60 * 10, // 10 hours
        });

        return sendSuccess(req, res, response, 201);
    }

    // Login
    async login(req: Request, res: Response) {
        const { email, password } = req.body as LoginInput;

        dd.log('login input', req.body);

        const user = await authService.login(email, password);
        dd.log('login success', user);

        const token = Helpers.generateJWTToken({
            sub: user._id,
            email: user.email,
        });

        const response = {
            id: user._id,
            email: user.email,
            authToken: token,
        };

        // set cookie
        res.cookie('authToken', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 1000 * 60 * 60 * 10, // 10 hours
        });

        return sendSuccess(req, res, response, 200);
    }

    // Logout
    async logout(req: Request, res: Response) {
        res.clearCookie('authToken', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
        });
        dd.log('logout success');
        return sendSuccess(
            req,
            res,
            { message: 'Logged out successfully' },
            200
        );
    }

    // Get me
    async getMe(req: AuthRequest, res: Response) {
        return sendSuccess(
            req,
            res,
            {
                id: req.user?._id,
                email: req.user?.email,
            },
            200
        );
    }
}

export const authController = new AuthController();

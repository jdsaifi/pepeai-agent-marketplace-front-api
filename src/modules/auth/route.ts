import { Router } from 'express';
import { authController } from './controller';
import { validate } from '../../middleware/validate';
// import { authenticate } from '../../middleware/auth';
import { loginSchema, registerSchema } from './schema';
import { asyncHandler } from '../../lib/asyncHandler';
import { authenticate } from '../../middleware/auth';

const router = Router();

// Register route
router.post(
    '/register',
    validate(registerSchema),
    asyncHandler(authController.resgister)
);

// Login route
router.post(
    '/login',
    validate(loginSchema),
    asyncHandler(authController.login)
);

// Logout route
router.post('/logout', asyncHandler(authController.logout));

router.get('/me', authenticate, asyncHandler(authController.getMe));

export default router;

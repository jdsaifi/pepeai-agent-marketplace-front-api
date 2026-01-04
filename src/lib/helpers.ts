import env from '../config/env';
import jwt from 'jsonwebtoken';
import slugify from 'slugify';
import { Types } from 'mongoose';
import { ddl } from './dd';

class Helpers {
    generateJWTToken(data: any) {
        const expiresIn = env.JWT_EXPIRES_IN as string;
        return jwt.sign(data, env.JWT_SECRET as string, {
            expiresIn: expiresIn as unknown as number,
        });
    }

    verifyJWTToken(token: string) {
        return jwt.verify(token, env.JWT_SECRET as string);
    }

    generateSlug(text: string) {
        return slugify(text, { lower: true, strict: true });
    }

    toMongoId(id: string) {
        if (Types.ObjectId.isValid(id)) {
            ddl('toMongoId ->', id);
            return Types.ObjectId.createFromHexString(id);
        }
        return id;
    }

    toMongoIdArray(ids: string[]) {
        return ids.map((id) => this.toMongoId(id));
    }
}

export default new Helpers();

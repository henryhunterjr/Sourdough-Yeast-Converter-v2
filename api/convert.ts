import { handler } from '@bgb/recipe-reader';
export const config = { runtime: 'edge' };
const h = handler();
export default (req: Request) => h(req);

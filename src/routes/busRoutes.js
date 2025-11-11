import express from 'express';
import { listBuses, getBus } from '../controllers/busController.js';

const router = express.Router();

router.get('/', listBuses);
router.get('/:id', getBus);

export default router;

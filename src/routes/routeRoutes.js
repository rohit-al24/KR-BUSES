import express from 'express';
import { listRoutes, getRoute, adminOverview, submitAttendance, getAttendance, confirmStudentFee, createAttendanceRequest, studentRespond, getLatestAttendanceRequest, getAttendanceRequestFull, finalizeAttendanceRequest, getTestCredentials, markStudentUnpaid } from '../controllers/routeController.js';

const router = express.Router();

router.get('/', listRoutes);
router.get('/:number', getRoute);
// coordinator: confirm student fee payment
router.post('/:number/students/:id/confirm-fee', confirmStudentFee);
// allow coordinator to mark a student as unpaid (dev/admin action)
router.post('/:number/students/:id/mark-unpaid', markStudentUnpaid);
// attendance request (triggered by scheduler or manually)
router.post('/:number/attendance-request', createAttendanceRequest);
// student responds to request
router.post('/:number/students/:id/respond', studentRespond);
// fetch latest attendance request for coordinator
router.get('/:number/attendance-request/latest', getLatestAttendanceRequest);
// dev/debug: full attendance request (includes pin + responses)
router.get('/:number/attendance-request/:id/full', getAttendanceRequestFull);
// finalize an active attendance request and record summary attendance
router.post('/:number/attendance-request/:id/finalize', finalizeAttendanceRequest);
// dev helper: sample credentials for this route (email + dob)
router.get('/:number/test-credentials', getTestCredentials);
// admin overview: shows per-route counts and bus info
router.get('/admin/overview', adminOverview);

// attendance endpoints
router.post('/:number/attendance', submitAttendance);
router.get('/:number/attendance', getAttendance);

export default router;

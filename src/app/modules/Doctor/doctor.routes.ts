import express from "express";
import { doctorController } from "./doctor.controller";

const router = express.Router();

// Get Top Rated Doctors
router.get("/top-rated", doctorController.getTopRatedDoctors);

// Get Doctors
router.get("/", doctorController.getDoctors);

// Get Doctor Details
router.get("/:id", doctorController.getDoctorDetails);

// Get Doctor slots
router.get("/:id/slots", doctorController.getDoctorSlots);

export const doctorRoutes = router;

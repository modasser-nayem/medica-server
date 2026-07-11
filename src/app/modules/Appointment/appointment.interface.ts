import { AppointmentStatus } from "@prisma/client";
import { appointmentSchemaValidation } from "./appointment.validation";
import { z } from "zod";
import { PaginationQuery } from "../../../utils/pagination";

export type TCreateAppointment = z.infer<
  typeof appointmentSchemaValidation.createAppointment
>["body"];

export type TRescheduleAppointment = z.infer<
  typeof appointmentSchemaValidation.rescheduleAppointment
>["body"];

export type TCancelAppointment = z.infer<
  typeof appointmentSchemaValidation.cancelAppointment
>["body"];

export interface IGetAppointmentsFilters extends PaginationQuery {
  status?: AppointmentStatus;
}

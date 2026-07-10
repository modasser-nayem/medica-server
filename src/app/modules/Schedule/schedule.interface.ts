import { z } from "zod";
import { scheduleSchemaValidation } from "./schedule.validation";

export type TCreateSchedule = z.infer<
  typeof scheduleSchemaValidation.createSchedule
>["body"];

export type TUpdateSchedule = z.infer<
  typeof scheduleSchemaValidation.updateSchedule
>["body"];

export type TCreateScheduleException = z.infer<
  typeof scheduleSchemaValidation.createScheduleException
>["body"];

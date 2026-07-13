export interface IInitiateCall {
  appointmentId: string;
  type: "VOICE" | "VIDEO";
  userId: string;
  userProfileId: string;
}

export interface UserInfo {
  id: string;
  name: string;
  email: string;
  role?: string;
  permissions?: string[];
  _cached?: boolean; // ใช้สำหรับ tracking ว่าข้อมูลมาจาก cache
}

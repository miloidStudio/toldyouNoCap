/**
 * 房間儲存層。
 *
 * 目前是 in-memory 實作（每局遊戲生命週期短，不需要資料庫），
 * 但介面刻意設計成「非同步、以 key 存取整包 Room JSON」的形式，
 * 之後要換成 Redis 只需要再寫一個 RedisRoomStore 實作同一個介面，
 * 上層 socket 邏輯完全不用改。
 */

import { Room } from '../../shared/types';

export interface RoomStore {
  get(code: string): Promise<Room | null>;
  set(room: Room): Promise<void>;
  delete(code: string): Promise<void>;
  has(code: string): Promise<boolean>;
  /** 列出所有房間（僅維運/清理用途，Redis 版可用 SCAN 實作） */
  all(): Promise<Room[]>;
}

export class InMemoryRoomStore implements RoomStore {
  private rooms = new Map<string, Room>();

  async get(code: string): Promise<Room | null> {
    return this.rooms.get(code) ?? null;
  }

  async set(room: Room): Promise<void> {
    this.rooms.set(room.code, room);
  }

  async delete(code: string): Promise<void> {
    this.rooms.delete(code);
  }

  async has(code: string): Promise<boolean> {
    return this.rooms.has(code);
  }

  async all(): Promise<Room[]> {
    return [...this.rooms.values()];
  }
}

import type * as Party from "partykit/server";
import { createCryptoRng } from "../shared/rng.ts";
import { RoomController } from "./room.ts";

export default class RoomServer implements Party.Server {
  private readonly controller: RoomController;

  constructor(readonly room: Party.Room) {
    this.controller = new RoomController(room.id, {
      transport: {
        send: (id, message) => room.getConnection(id)?.send(JSON.stringify(message)),
        close: (id, code, reason) => room.getConnection(id)?.close(code, reason),
      },
      clock: { now: () => Date.now() },
      scheduler: {
        set: (ms, callback) => setTimeout(callback, ms),
        clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
      },
      rng: createCryptoRng(),
    });
  }

  onConnect(connection: Party.Connection, context: Party.ConnectionContext): void {
    this.controller.onConnect(connection.id, context.request.url);
  }

  onMessage(message: string | ArrayBuffer | ArrayBufferView, connection: Party.Connection): void {
    this.controller.onMessage(connection.id, message);
  }

  onClose(connection: Party.Connection): void {
    this.controller.onClose(connection.id);
  }

  onError(connection: Party.Connection): void {
    this.controller.onClose(connection.id);
  }
}

RoomServer satisfies Party.Worker;

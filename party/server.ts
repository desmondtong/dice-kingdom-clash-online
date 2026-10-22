import type * as Party from "partykit/server";

// Placeholder room server for the scaffold-project change: accepts connections and
// greets each one. Game logic arrives in build-game-server.
export default class RoomServer implements Party.Server {
  constructor(readonly room: Party.Room) {}

  onConnect(connection: Party.Connection) {
    connection.send(JSON.stringify({ type: "hello", room: this.room.id }));
  }
}

RoomServer satisfies Party.Worker;

declare module '@metered-ca/realtime' {
  export interface RemotePeer {
    id: string;
    on(event: string, callback: (...args: any[]) => void): void;
  }

  export interface MeteredPeerOptions {
    apiKey?: string;
    tokenProvider?: () => Promise<string>;
    rtcPeerConnectionFactory?: (config: any) => any;
  }

  export class MeteredPeer {
    id: string;
    constructor(options: MeteredPeerOptions);
    join(roomName: string): Promise<void>;
    leave(): Promise<void>;
    send(data: any): Promise<void>;
    sendTo(peerId: string, data: any): Promise<void>;
    on(event: 'connect', callback: () => void): void;
    on(event: 'disconnect', callback: () => void): void;
    on(event: 'joined', callback: (eventArgs: { peerId: string; channel: string }) => void): void;
    on(event: 'left', callback: (eventArgs: { peerId: string; channel: string; reason?: string }) => void): void;
    on(event: 'state-change', callback: (eventArgs: { from: string; to: string }) => void): void;
    on(event: 'peer-joined', callback: (eventArgs: { peer: RemotePeer }) => void): void;
    on(event: 'peer-left', callback: (eventArgs: { peer: RemotePeer }) => void): void;
    on(event: 'data', callback: (eventArgs: { senderPeerId: string; data: any }) => void): void;
    on(event: string, callback: (...args: any[]) => void): void;
  }
}

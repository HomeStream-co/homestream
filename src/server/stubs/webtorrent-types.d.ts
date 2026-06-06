declare module 'webtorrent' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const WebTorrent: new (...args: any[]) => any;
  export default WebTorrent;
}

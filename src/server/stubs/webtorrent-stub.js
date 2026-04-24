/**
 * webtorrent-stub.js
 *
 * Production cloud stub for WebTorrent.
 * Torrent downloading requires a local desktop install — it cannot run
 * in a cloud/serverless environment. This stub satisfies the import so
 * the server starts cleanly; all torrent operations return a clear error.
 */

class WebTorrentStub {
  constructor() {
    this.torrents = [];
  }

  add(_magnet, _opts, cb) {
    const err = new Error('WebTorrent is not available in cloud/hosted mode. Run HomeStream locally for torrent downloads.');
    if (typeof cb === 'function') cb(err);
    return { on: () => {}, destroy: () => {} };
  }

  remove(_id, _opts, cb) {
    if (typeof cb === 'function') cb(null);
  }

  destroy(cb) {
    if (typeof cb === 'function') cb(null);
  }
}

export default WebTorrentStub;

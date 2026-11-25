(function (root) {
  'use strict';

  const PARAM = 'bouquet';
  // Version 1 identifies the existing timestamp-seeded recipe and geometry.
  const VERSION = '1';
  const MAX_TIMESTAMP = 8640000000000000; // ECMAScript Date limit in milliseconds.
  const isTimestamp = value => Number.isSafeInteger(value) && value >= 0 && value <= MAX_TIMESTAMP;

  function read(search) {
    const values = new URLSearchParams(search).getAll(PARAM);
    if (!values.length) return { status: 'absent' };
    if (values.length !== 1) return { status: 'invalid' };

    const value = values[0];
    const match = /^(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,15})$/.exec(value);
    if (!match || match[0] !== value) return { status: 'invalid' };
    const timestamp = Number(match[2]);
    if (!isTimestamp(timestamp)) return { status: 'invalid' };
    if (match[1] !== VERSION) return { status: 'unsupported' };

    return { status: 'valid', timestamp };
  }

  function create(address, timestamp) {
    const url = new URL(address);
    if (!['http:', 'https:'].includes(url.protocol) || !isTimestamp(timestamp)) return null;
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    url.searchParams.set(PARAM, `${VERSION}.${timestamp}`);
    return url.href;
  }

  function withoutBouquet(address) {
    const url = new URL(address);
    if (!url.searchParams.has(PARAM)) return url.href;
    url.searchParams.delete(PARAM);
    return url.href;
  }

  const api = { read, create, withoutBouquet };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BouquetLink = api;
})(typeof window !== 'undefined' ? window : globalThis);

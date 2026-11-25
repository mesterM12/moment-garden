(function (root) {
  'use strict';

  const PARAM = 'bouquet';
  const HEX_TOKEN = /^(?:0|[1-9a-f][0-9a-f]{0,13})$/;
  const MAX_TIMESTAMP = 8640000000000000; // ECMAScript Date limit in milliseconds.
  const isTimestamp = value => Number.isSafeInteger(value) && value >= 0 && value <= MAX_TIMESTAMP;

  function read(search) {
    const values = new URLSearchParams(search).getAll(PARAM);
    if (!values.length) return { status: 'absent' };
    if (values.length !== 1) return { status: 'invalid' };

    const value = values[0];
    const match = HEX_TOKEN.exec(value);
    if (!match || match[0] !== value) return { status: 'invalid' };
    const timestamp = Number.parseInt(value, 16);
    if (!isTimestamp(timestamp)) return { status: 'invalid' };
    return { status: 'valid', timestamp };
  }

  function create(address, timestamp) {
    const url = new URL(address);
    if (!['http:', 'https:'].includes(url.protocol) || !isTimestamp(timestamp)) return null;
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    url.searchParams.set(PARAM, timestamp.toString(16));
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

export const pollMetaKey = (id: string) => `poll:${id}:meta`;
export const pollCountsKey = (id: string) => `poll:${id}:counts`;
export const pollVotersKey = (id: string) => `poll:${id}:voters`;
export const pollVotersMetaKey = (id: string) => `poll:${id}:voters_meta`;
export const pollChoicesKey = (id: string, userId: string) =>
  `poll:${id}:choices:${userId}`;
export const pollIndexKey = () => "poll:index";
export const POLL_INDEX_KEY = "poll:index";


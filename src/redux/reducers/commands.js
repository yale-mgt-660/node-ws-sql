export default function commandsReducer(state = {}, action) {
  const { type, payload } = action;
  if (!(payload && payload.cid)) return state;
  return {
    ...state,
    [payload.cid]: !state[payload.cid] ? [payload] : [...state[payload.cid], payload],
  };
}

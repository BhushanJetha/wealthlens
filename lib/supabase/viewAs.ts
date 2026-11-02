// Family sharing: which member an owner is viewing. The cookie only says what
// to ask for; the database decides (migration 038), so a made-up value shows nothing.
export const VIEW_AS_COOKIE = 'wl-view-as'
export const VIEW_AS_HEADER = 'x-wl-view-as'
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/* Public settings for the officials' sign-in. Both values are safe to publish:
   the anon key only reads public data, and every write is checked by the database.
   Leave them empty to keep using access codes. */
window.CAMP_CFG = {
  supabaseUrl: "",
  supabaseAnon: "",
  vapidPublic: "BF9GTO3n1Ew1LOauLuXgbC-9cosb_OJgk8CqRqURRpLB8ebmynNjtXlOXJULpE9TBq91Jc3u3fWad6SMAlwIgBE"
};

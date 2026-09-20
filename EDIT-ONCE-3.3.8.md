# Love Letter 3.3.8 — one edit per letter

- Each created letter can be edited only once.
- The limit is enforced in D1 with `stories.edit_count`, not only in localStorage.
- A second save returns `edit_limit_reached` and leaves the existing letter unchanged.
- Delete and URL regeneration still remain available to the owner because they are management actions, not content edits.

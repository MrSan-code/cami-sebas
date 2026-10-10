-- One row per guest per game: only their best score is kept.
CREATE TABLE IF NOT EXISTS scores (
  game TEXT NOT NULL,
  guest TEXT NOT NULL,
  score INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (game, guest)
);

CREATE INDEX IF NOT EXISTS scores_by_game ON scores (game, score);

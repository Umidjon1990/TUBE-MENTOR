CREATE TABLE IF NOT EXISTS commerce_support_tickets (
 id varchar PRIMARY KEY,
 user_id varchar NOT NULL REFERENCES users(id),
 category text NOT NULL CHECK(category IN('payment','lesson','refund','other')),
 subject text NOT NULL CHECK(char_length(subject) BETWEEN 3 AND 160),
 status text NOT NULL DEFAULT 'open' CHECK(status IN('open','answered','closed')),
 order_id varchar REFERENCES payment_orders(id),
 lesson_id integer REFERENCES lessons(id),
 full_name_snapshot text NOT NULL,
 created_at timestamp NOT NULL DEFAULT now(),
 updated_at timestamp NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS commerce_support_messages (
 id serial PRIMARY KEY,
 ticket_id varchar NOT NULL REFERENCES commerce_support_tickets(id),
 author_id varchar NOT NULL REFERENCES users(id),
 author_role text NOT NULL CHECK(author_role IN('student','admin')),
 author_name_snapshot text NOT NULL,
 message text NOT NULL CHECK(char_length(message) BETWEEN 3 AND 4000),
 created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS commerce_support_tickets_user_date ON commerce_support_tickets(user_id,updated_at DESC);
CREATE INDEX IF NOT EXISTS commerce_support_tickets_status_date ON commerce_support_tickets(status,updated_at DESC);
CREATE INDEX IF NOT EXISTS commerce_support_messages_ticket_date ON commerce_support_messages(ticket_id,id);
CREATE OR REPLACE FUNCTION protect_commerce_support_history() RETURNS trigger AS $$
BEGIN
 RAISE EXCEPTION 'Support messages are immutable; append a new reply';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS commerce_support_messages_append_only ON commerce_support_messages;
CREATE TRIGGER commerce_support_messages_append_only BEFORE UPDATE OR DELETE ON commerce_support_messages FOR EACH ROW EXECUTE FUNCTION protect_commerce_support_history();

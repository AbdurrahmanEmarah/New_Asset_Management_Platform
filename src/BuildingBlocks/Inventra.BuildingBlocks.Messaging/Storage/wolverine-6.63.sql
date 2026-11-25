-- Wolverine 6.63 message storage (schema wolverine), as Wolverine itself creates it.
-- Captured with pg_dump --schema-only from a database Wolverine built. Applied by EF migrations
-- (CreateWolverineStorage), so the migrator owns these tables and the runtime login only uses them.
-- When Wolverine is upgraded and its schema changes, capture a new file and add a new migration.


CREATE SCHEMA IF NOT EXISTS wolverine;

CREATE TABLE wolverine.wolverine_agent_restrictions (
    id uuid NOT NULL,
    uri character varying NOT NULL,
    type character varying NOT NULL,
    node integer DEFAULT 0 NOT NULL
);

CREATE TABLE wolverine.wolverine_control_queue (
    id uuid NOT NULL,
    message_type character varying NOT NULL,
    node_id uuid NOT NULL,
    body bytea NOT NULL,
    posted timestamp with time zone DEFAULT now() NOT NULL,
    expires timestamp with time zone
);

CREATE TABLE wolverine.wolverine_dead_letter_history (
    id uuid NOT NULL,
    replay_count integer,
    last_replayed_at timestamp with time zone,
    first_failed_at timestamp with time zone
);

CREATE TABLE wolverine.wolverine_dead_letters (
    id uuid NOT NULL,
    execution_time timestamp with time zone,
    body bytea NOT NULL,
    message_type character varying NOT NULL,
    received_at character varying,
    source character varying,
    exception_type character varying,
    exception_message character varying,
    sent_at timestamp with time zone,
    replayable boolean,
    failure_group character varying(100),
    failure_title character varying(500),
    failed_at timestamp with time zone,
    first_failed_at timestamp with time zone,
    replay_count integer,
    last_replayed_at timestamp with time zone,
    archived_at timestamp with time zone
);

CREATE TABLE wolverine.wolverine_incoming_envelopes (
    id uuid NOT NULL,
    status character varying NOT NULL,
    owner_id integer NOT NULL,
    execution_time timestamp with time zone,
    attempts integer DEFAULT 0,
    body bytea NOT NULL,
    message_type character varying NOT NULL,
    received_at character varying,
    keep_until timestamp with time zone
);

CREATE TABLE wolverine.wolverine_node_assignments (
    id character varying NOT NULL,
    node_id uuid,
    started timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE wolverine.wolverine_node_records (
    id integer NOT NULL,
    node_number integer NOT NULL,
    event_name character varying NOT NULL,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
    description character varying
);

CREATE SEQUENCE wolverine.wolverine_node_records_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE wolverine.wolverine_node_records_id_seq OWNED BY wolverine.wolverine_node_records.id;

CREATE TABLE wolverine.wolverine_nodes (
    id uuid NOT NULL,
    node_number integer NOT NULL,
    description character varying NOT NULL,
    uri character varying NOT NULL,
    started timestamp with time zone DEFAULT now() NOT NULL,
    health_check timestamp with time zone DEFAULT now() NOT NULL,
    version character varying,
    capabilities text[]
);

CREATE SEQUENCE wolverine.wolverine_nodes_node_number_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE wolverine.wolverine_nodes_node_number_seq OWNED BY wolverine.wolverine_nodes.node_number;

CREATE TABLE wolverine.wolverine_outgoing_envelopes (
    id uuid NOT NULL,
    owner_id integer NOT NULL,
    destination character varying NOT NULL,
    deliver_by timestamp with time zone,
    body bytea NOT NULL,
    attempts integer DEFAULT 0,
    message_type character varying NOT NULL
);

ALTER TABLE ONLY wolverine.wolverine_node_records ALTER COLUMN id SET DEFAULT nextval('wolverine.wolverine_node_records_id_seq'::regclass);

ALTER TABLE ONLY wolverine.wolverine_nodes ALTER COLUMN node_number SET DEFAULT nextval('wolverine.wolverine_nodes_node_number_seq'::regclass);

ALTER TABLE ONLY wolverine.wolverine_agent_restrictions
    ADD CONSTRAINT pkey_wolverine_agent_restrictions_id PRIMARY KEY (id);

ALTER TABLE ONLY wolverine.wolverine_control_queue
    ADD CONSTRAINT pkey_wolverine_control_queue_id PRIMARY KEY (id);

ALTER TABLE ONLY wolverine.wolverine_dead_letter_history
    ADD CONSTRAINT pkey_wolverine_dead_letter_history_id PRIMARY KEY (id);

ALTER TABLE ONLY wolverine.wolverine_dead_letters
    ADD CONSTRAINT pkey_wolverine_dead_letters_id PRIMARY KEY (id);

ALTER TABLE ONLY wolverine.wolverine_incoming_envelopes
    ADD CONSTRAINT pkey_wolverine_incoming_envelopes_id PRIMARY KEY (id);

ALTER TABLE ONLY wolverine.wolverine_node_assignments
    ADD CONSTRAINT pkey_wolverine_node_assignments_id PRIMARY KEY (id);

ALTER TABLE ONLY wolverine.wolverine_node_records
    ADD CONSTRAINT pkey_wolverine_node_records_id PRIMARY KEY (id);

ALTER TABLE ONLY wolverine.wolverine_nodes
    ADD CONSTRAINT pkey_wolverine_nodes_id PRIMARY KEY (id);

ALTER TABLE ONLY wolverine.wolverine_outgoing_envelopes
    ADD CONSTRAINT pkey_wolverine_outgoing_envelopes_id PRIMARY KEY (id);

CREATE INDEX idx_wolverine_dead_letter_history_last_replayed_at ON wolverine.wolverine_dead_letter_history USING btree (last_replayed_at);

CREATE INDEX idx_wolverine_dead_letters_failure_group ON wolverine.wolverine_dead_letters USING btree (failure_group);

CREATE INDEX idx_wolverine_dead_letters_replayable ON wolverine.wolverine_dead_letters USING btree (replayable) WHERE (replayable = true);

CREATE INDEX idx_wolverine_incoming_envelopes_keep_until ON wolverine.wolverine_incoming_envelopes USING btree (keep_until) WHERE ((status)::text = 'Handled'::text);

CREATE INDEX idx_wolverine_incoming_envelopes_owner ON wolverine.wolverine_incoming_envelopes USING btree (owner_id) WHERE (owner_id <> 0);

CREATE INDEX idx_wolverine_incoming_envelopes_recover ON wolverine.wolverine_incoming_envelopes USING btree (received_at) WHERE (((status)::text = 'Incoming'::text) AND (owner_id = 0));

CREATE INDEX idx_wolverine_incoming_envelopes_scheduled ON wolverine.wolverine_incoming_envelopes USING btree (execution_time) WHERE ((status)::text = 'Scheduled'::text);

CREATE INDEX idx_wolverine_outgoing_envelopes_owner ON wolverine.wolverine_outgoing_envelopes USING btree (owner_id) WHERE (owner_id <> 0);

CREATE INDEX idx_wolverine_outgoing_envelopes_recover ON wolverine.wolverine_outgoing_envelopes USING btree (destination) WHERE (owner_id = 0);

ALTER TABLE ONLY wolverine.wolverine_node_assignments
    ADD CONSTRAINT fkey_wolverine_node_assignments_node_id FOREIGN KEY (node_id) REFERENCES wolverine.wolverine_nodes(id) ON DELETE CASCADE;


DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_subscription WHERE subname = 'travel_planner_sub') THEN
        ALTER SUBSCRIPTION travel_planner_sub DISABLE;
        DROP SUBSCRIPTION travel_planner_sub;
    END IF;
END
$$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_replication_slots WHERE slot_name = 'travel_planner_sub') THEN
        PERFORM pg_drop_replication_slot('travel_planner_sub');
    END IF;
END
$$;

CREATE SUBSCRIPTION travel_planner_sub
    CONNECTION 'host=postgres port=5432 dbname=travel_planner user=repuser password=repuser'
    PUBLICATION travel_planner_pub
    WITH (copy_data = true);

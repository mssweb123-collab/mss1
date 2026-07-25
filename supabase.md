-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.classes (
  id text NOT NULL,
  name text NOT NULL,
  section text,
  grade integer,
  CONSTRAINT classes_pkey PRIMARY KEY (id)
);
CREATE TABLE public.students (
  id text NOT NULL,
  roll_no text NOT NULL,
  name text NOT NULL,
  dob date,
  class_id text,
  type text DEFAULT 'dayscholar'::text,
  bus_id text,
  phone text,
  parent_name text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT students_pkey PRIMARY KEY (id),
  CONSTRAINT students_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id)
);
CREATE TABLE public.teachers (
  id text NOT NULL,
  name text NOT NULL,
  username text NOT NULL UNIQUE,
  password text NOT NULL,
  class_id text,
  phone text,
  email text,
  created_at timestamp with time zone DEFAULT now(),
  dob date,
  CONSTRAINT teachers_pkey PRIMARY KEY (id)
);
CREATE TABLE public.buses (
  id text NOT NULL,
  number text NOT NULL,
  route text,
  driver text,
  phone text,
  capacity integer DEFAULT 40,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT buses_pkey PRIMARY KEY (id)
);
CREATE TABLE public.attendance_logs (
  id bigint NOT NULL DEFAULT nextval('attendance_logs_id_seq'::regclass),
  student_id text,
  date date NOT NULL,
  type text NOT NULL CHECK (type = ANY (ARRAY['class'::text, 'bus'::text, 'bus-morning'::text, 'bus-evening'::text])),
  present boolean DEFAULT false,
  recorded_at timestamp with time zone DEFAULT now(),
  CONSTRAINT attendance_logs_pkey PRIMARY KEY (id),
  CONSTRAINT attendance_logs_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id)
);
CREATE TABLE public.marks (
  id bigint NOT NULL DEFAULT nextval('marks_id_seq'::regclass),
  student_id text,
  subject text NOT NULL,
  exam text NOT NULL,
  marks_obtained integer,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT marks_pkey PRIMARY KEY (id),
  CONSTRAINT marks_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id)
);
CREATE TABLE public.class_subjects (
  class_id text NOT NULL,
  subject text NOT NULL,
  max_marks integer DEFAULT 100,
  CONSTRAINT class_subjects_pkey PRIMARY KEY (class_id, subject),
  CONSTRAINT class_subjects_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id)
);
CREATE TABLE public.student_billing (
  id bigint NOT NULL DEFAULT nextval('student_billing_id_seq'::regclass),
  student_id text NOT NULL UNIQUE,
  student_name text NOT NULL,
  total_fee numeric NOT NULL DEFAULT 0,
  total_fee_paid numeric NOT NULL DEFAULT 0,
  balance_fee numeric DEFAULT (total_fee - total_fee_paid),
  last_paid_date date,
  updated_at timestamp with time zone DEFAULT now(),
  paid_months text,
  current_month_status text DEFAULT 'unpaid'::text,
  bus_fee numeric DEFAULT 0,
  admission_fee numeric DEFAULT 0,
  CONSTRAINT student_billing_pkey PRIMARY KEY (id),
  CONSTRAINT student_billing_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id)
);
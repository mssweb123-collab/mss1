## Table `classes`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `name` | `text` |  |
| `section` | `text` |  Nullable |
| `grade` | `int4` |  Nullable |

## Table `students`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `roll_no` | `text` |  |
| `name` | `text` |  |
| `dob` | `date` |  Nullable |
| `class_id` | `text` |  Nullable |
| `type` | `text` |  Nullable |
| `bus_id` | `text` |  Nullable |
| `phone` | `text` |  Nullable |
| `parent_name` | `text` |  Nullable |
| `academic_year` | `text` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |

## Table `teachers`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `name` | `text` |  |
| `username` | `text` |  Unique |
| `password` | `text` |  |
| `class_id` | `text` |  Nullable |
| `phone` | `text` |  Nullable |
| `email` | `text` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |

## Table `buses`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `number` | `text` |  |
| `route` | `text` |  Nullable |
| `driver` | `text` |  Nullable |
| `phone` | `text` |  Nullable |
| `capacity` | `int4` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |

## Table `attendance_logs`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int8` | Primary |
| `student_id` | `text` | Nullable, Foreign Key (references students.id ON DELETE CASCADE) |
| `date` | `date` |  |
| `type` | `text` | CHECK (type IN ('class', 'bus', 'bus-morning', 'bus-evening')) |
| `present` | `bool` | Nullable |
| `recorded_at` | `timestamptz` | Nullable |

### Constraints
- `UNIQUE(student_id, date, type)`: Ensure a single log entry per student/date/type.
- `CHECK(type IN ('class', 'bus', 'bus-morning', 'bus-evening'))`: Ensure log type conforms to class or bus shifts.

## Table `marks`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int8` | Primary |
| `student_id` | `text` |  Nullable |
| `subject` | `text` |  |
| `exam` | `text` |  |
| `marks_obtained` | `int4` |  Nullable |
| `updated_at` | `timestamptz` |  Nullable |

## Table `class_subjects`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `class_id` | `text` | Foreign key (references classes.id) |
| `subject` | `text` |  |
| `max_marks` | `int4` | Default 100 |



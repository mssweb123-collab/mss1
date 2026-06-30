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
| `student_id` | `text` |  Nullable |
| `date` | `date` |  |
| `type` | `text` |  |
| `present` | `bool` |  Nullable |
| `recorded_at` | `timestamptz` |  Nullable |

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
| `class_id` | `text` | Primary |
| `subject` | `text` | Primary |
| `max_marks` | `int4` |  Nullable |

## Table `accountants`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `name` | `text` |  |
| `username` | `text` |  Unique |
| `password` | `text` |  |
| `phone` | `text` |  Nullable |
| `email` | `text` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |

## Table `fee_structures`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `class_id` | `text` |  Nullable |
| `academic_year` | `text` |  |
| `amount` | `int4` |  |
| `created_at` | `timestamptz` |  Nullable |

## Table `student_fees`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `student_id` | `text` |  Nullable |
| `academic_year` | `text` |  |
| `yearly_fee` | `int4` |  |
| `bus_fee` | `int4` |  |
| `book_fee` | `int4` |  |
| `uniform_fee` | `int4` |  |
| `other_fee` | `int4` |  |
| `previous_balance` | `int4` |  |
| `discount` | `int4` |  |
| `total_due` | `int4` |  |
| `total_paid` | `int4` |  |
| `status` | `text` |  |
| `custom_fees` | `jsonb` | Nullable |
| `created_at` | `timestamptz` |  Nullable |

## Table `fee_payments`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `student_id` | `text` |  Nullable |
| `academic_year` | `text` |  |
| `amount_paid` | `int4` |  |
| `payment_date` | `date` |  |
| `payment_mode` | `text` |  |
| `receipt_no` | `text` |  Unique |
| `notes` | `text` |  Nullable |
| `collected_by` | `text` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |

## Table `fee_logs`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `action` | `text` |  |
| `details` | `text` |  Nullable |
| `user_id` | `text` |  Nullable |
| `user_name` | `text` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |


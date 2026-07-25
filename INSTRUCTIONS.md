# OpenCode Development Instructions

## Core Principles
*   **Production-Ready Code**: Always write clean, efficient, and well-structured code that is ready for deployment.
*   **Utilize OpenCode Features**: Leverage all available tools (Grep, Glob, Read, Edit, Bash, etc.) to ensure precision and context-awareness.
*   **Strict Adherence**: Follow user instructions exactly. Only implement what is requested.
*   **High-Level Output**: Deliver exceptional logic, UI/UX polish, and technical accuracy (Claude 3.5 Sonnet / Opus level quality).

## Communication Style
*   **Short Bullet Summaries**: Provide quick, actionable updates using bullet points.also tell suggestion to improve it (but only do with user permisssion if user not repond avoid it )
*   **User-Centric**: Only discuss concepts and features known to the user.
*   **Concise Suggestions**: Offer recommendations in brief bullet points only when necessary.


ALTER TABLE student_billing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Billing select" ON student_billing FOR SELECT USING (true);
CREATE POLICY "Billing insert" ON student_billing FOR INSERT WITH CHECK (true);
CREATE POLICY "Billing update" ON student_billing FOR UPDATE USING (true);
CREATE POLICY "Billing delete" ON student_billing FOR DELETE USING (true);

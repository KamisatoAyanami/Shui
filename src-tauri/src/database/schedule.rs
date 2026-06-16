use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct ScheduleItem {
    pub time: String,
    pub label: String,
    pub ratio: f64,
    pub amount_ml: i64,
}

/// Calculate the golden drinking schedule based on daily goal (goal_ml).
///
/// 7 time slots with fixed ratios:
/// 07:00(15%), 09:30(14%), 11:30(12%), 13:30(12%),
/// 15:30(15%), 17:30(17%), 21:00(15%)
///
/// Rounding remainder is adjusted into the last slot to ensure the sum equals goal_ml.
pub fn calculate_schedule(goal_ml: i64) -> Vec<ScheduleItem> {
    let slots = vec![
        ("07:00", "起床空腹", 0.15),
        ("09:30", "上午中段", 0.14),
        ("11:30", "午餐前", 0.12),
        ("13:30", "午餐后", 0.12),
        ("15:30", "下午中段", 0.15),
        ("17:30", "下班/放学前", 0.17),
        ("21:00", "睡前1小时", 0.15),
    ];

    let mut total_assigned: i64 = 0;
    let mut items: Vec<ScheduleItem> = Vec::new();

    // Calculate all but the last slot
    for (i, (time, label, ratio)) in slots.iter().enumerate() {
        let amount = if i == slots.len() - 1 {
            // Last slot gets the remainder
            goal_ml - total_assigned
        } else {
            let val = (goal_ml as f64 * ratio).round() as i64;
            total_assigned += val;
            val
        };

        items.push(ScheduleItem {
            time: time.to_string(),
            label: label.to_string(),
            ratio: *ratio,
            amount_ml: amount,
        });
    }

    items
}

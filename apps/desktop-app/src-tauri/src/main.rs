// Prevents an additional console window on Windows in release builds. Keep
// this comment attribute exactly as-is -- it's the standard Tauri scaffold
// idiom.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    whoami_desktop_app_lib::run();
}

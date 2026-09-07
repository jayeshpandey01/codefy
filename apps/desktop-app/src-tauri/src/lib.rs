// Worker-only architecture (see CLAUDE.md Part 6 / the build plan's Part 6):
// the analysis engine runs entirely in a Web Worker inside the frontend via
// @whoami/core/wasm. This Rust side exists ONLY to grant the frontend
// filesystem access -- the dialog plugin (folder picker) and fs plugin
// (recursive read), both called from the main thread's own
// src/bridge/workspaceFs.ts, never from the Worker. There is deliberately no
// #[tauri::command] registered here: the frontend never needs a bespoke
// Rust-side command, it only needs the two plugins' own JS APIs.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .run(tauri::generate_context!())
        .expect("error while running the WhoAmI desktop app");
}

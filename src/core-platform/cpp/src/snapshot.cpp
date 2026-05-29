#include <filesystem>
#include <fstream>
#include <iomanip>
#include <string>

#include "core_platform/snapshot.hpp"
#include "core_platform/types.hpp"

namespace core_platform {

namespace {

void ensure_parent(const std::string& path) {
  std::filesystem::path p(path);
  if (!p.parent_path().empty()) {
    std::filesystem::create_directories(p.parent_path());
  }
}

}  // namespace

void write_snapshot(const LineState& s, const std::string& output_path) {
  ensure_parent(output_path);
  std::ofstream out(output_path, std::ios::trunc);

  out << "{\n";
  out << "  \"line_mode\": \"" << s.line_mode << "\",\n";
  out << "  \"safety_mode\": \"" << s.safety_mode << "\",\n";
  out << "  \"batch_id\": \"" << s.batch_id << "\",\n";
  out << "  \"stations\": {"
      << "\"infeed\": \"" << s.infeed << "\", "
      << "\"weld\": \"" << s.weld << "\", "
      << "\"qc\": \"" << s.qc << "\"},\n";
  out << "  \"metrics\": {\"units_total\": " << s.metrics.units_total
      << ", \"units_ok\": " << s.metrics.units_ok
      << ", \"units_defective\": " << s.metrics.units_defective
      << ", \"health_score\": "
      << std::fixed << std::setprecision(2) << s.metrics.health_score
      << "},\n";
  out << "  \"humanoid\": {\"mode\": \"" << s.humanoid.mode
      << "\", \"task\": \"" << s.humanoid.task
      << "\", \"battery\": " << s.humanoid.battery << "}\n";
  out << "}\n";
}

}  // namespace core_platform

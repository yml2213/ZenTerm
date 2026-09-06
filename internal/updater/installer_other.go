//go:build !darwin && !windows && !linux

package updater

import (
	"fmt"
)

// ApplyUpdateAndRestart 其他未知操作系统平台回退提示
func ApplyUpdateAndRestart(archivePath string) error {
	return fmt.Errorf("当前系统暂不支持一键重启更新，请手动解压并替换应用程序")
}

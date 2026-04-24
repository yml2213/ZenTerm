package main

import (
	"context"
	"fmt"

	"zenterm/internal/model"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

func (a *App) beforeClose(context.Context) bool {
	a.persistWindowState()
	return false
}

func (a *App) shutdown(context.Context) {
	a.persistWindowState()
	_ = a.service.CloseAll()
}

// PersistWindowState 主动持久化当前窗口尺寸，供前端在窗口变化后触发保存 / persists the current window metrics on demand for frontend-triggered saves.
func (a *App) PersistWindowState() {
	a.persistWindowState()
}

func (a *App) persistWindowState() {
	if a.ctx == nil || a.store == nil {
		return
	}

	width, height := runtime.WindowGetSize(a.ctx)
	state := model.WindowState{
		Width:     width,
		Height:    height,
		Maximised: runtime.WindowIsMaximised(a.ctx),
	}

	if err := a.store.SaveWindowState(state); err != nil {
		runtime.LogWarning(a.ctx, fmt.Sprintf("save window state: %v", err))
	}
}

func (a *App) emitEvent(event string, payload any) {
	if a.ctx == nil {
		return
	}

	runtime.EventsEmit(a.ctx, event, payload)
}

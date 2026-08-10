package cmd

import (
	"errors"
	"testing"
	"time"
)

func TestWebDAVSyncOperationCanBeCancelled(t *testing.T) {
	app := &App{}
	ctx, finish, err := app.beginWebDAVSyncOperation()
	if err != nil {
		t.Fatalf("beginWebDAVSyncOperation() error = %v", err)
	}

	if _, _, err := app.beginWebDAVSyncOperation(); !errors.Is(err, ErrWebDAVSyncInProgress) {
		t.Fatalf("second beginWebDAVSyncOperation() error = %v, want ErrWebDAVSyncInProgress", err)
	}

	app.CancelWebDAVSync()
	select {
	case <-ctx.Done():
	case <-time.After(time.Second):
		t.Fatal("CancelWebDAVSync() did not cancel the active context")
	}
	finish()

	_, nextFinish, err := app.beginWebDAVSyncOperation()
	if err != nil {
		t.Fatalf("beginWebDAVSyncOperation() after finish error = %v", err)
	}
	nextFinish()
}

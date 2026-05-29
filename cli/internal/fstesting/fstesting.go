// Package fstesting provides test assertion helpers.
package fstesting

import (
	"fmt"
	"reflect"
	"testing"
)

// Assert fails the test if condition is false.
func Assert(t *testing.T, condition bool, format string, a ...interface{}) {
	t.Helper()
	if !condition {
		t.Fatalf("(FAIL) "+format, a...)
	}
}

// Ok fails the test if err is not nil.
func Ok(t *testing.T, err error, format string, a ...interface{}) {
	t.Helper()
	if err != nil {
		t.Fatalf("(FAIL) "+format+": %v", append(a, err)...)
	}
}

// Equals fails the test if expected is not equal to actual.
func Equals(t testing.TB, expected, actual interface{}, format string, a ...interface{}) {
	t.Helper()
	if !reflect.DeepEqual(expected, actual) {
		t.Fatalf("(FAIL) "+format+"\n  expected: %v\n  actual:   %v",
			append(a, fmt.Sprintf("%v", expected), fmt.Sprintf("%v", actual))...)
	}
}

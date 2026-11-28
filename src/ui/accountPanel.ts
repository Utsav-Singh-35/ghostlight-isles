import { ACCOUNTS } from '../sim/balance';
import { el } from './dom';

export interface AccountActions {
  /** Each resolves, or rejects with a message that is safe to show. */
  register(username: string, password: string): Promise<void>;
  login(username: string, password: string): Promise<void>;
  logout(): void;
  close(): void;
}

export interface AccountView {
  readonly name: string;
  /** Missing for guests. */
  readonly username?: string;
  readonly online: boolean;
}

const USERNAME_HINT = `${ACCOUNTS.usernameMinLength} to ${ACCOUNTS.usernameMaxLength} letters, numbers or _, starting with a letter`;
const PASSWORD_HINT = `${ACCOUNTS.passwordMinLength} to ${ACCOUNTS.passwordMaxLength} characters`;
const USERNAME = new RegExp(`^[A-Za-z][A-Za-z0-9_]{${ACCOUNTS.usernameMinLength - 1},${ACCOUNTS.usernameMaxLength - 1}}$`);

/** The Account panel: create an account (keeping a guest's progress), log in, or log out. */
export class AccountPanel {
  private readonly root: HTMLElement;
  private readonly body: HTMLElement;
  private busy = false;

  constructor(
    parent: HTMLElement,
    private readonly actions: AccountActions,
  ) {
    this.root = el('aside', 'side-panel account-panel');
    this.root.hidden = true;
    this.root.setAttribute('aria-label', 'Account');
    this.body = el('div', 'bp-body');
    const close = el('button', 'ghost-button bp-close', 'Close');
    close.type = 'button';
    close.addEventListener('click', () => actions.close());
    this.root.append(el('h2', 'bp-title', 'Account'), this.body, close);
    parent.append(this.root);
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  close(): void {
    this.root.hidden = true;
  }

  show(view: AccountView): void {
    this.body.replaceChildren(...(view.username ? this.signedIn(view) : this.guest(view)));
    this.root.hidden = false;
    this.root.querySelector<HTMLInputElement>('input')?.focus();
  }

  private signedIn(view: AccountView): Node[] {
    const out: Node[] = [el('p', 'ac-line', `Signed in as ${view.username}.`)];
    out.push(el('p', 'ac-note', view.online ? 'Your captain is saved online. Log in with this username on any device.' : 'Playing offline: this account is saved on this device only.'));
    const logout = el('button', 'ghost-button', 'Log out');
    logout.type = 'button';
    logout.addEventListener('click', () => this.actions.logout());
    out.push(logout);
    return out;
  }

  private guest(view: AccountView): Node[] {
    const intro = el('p', 'ac-note', `You're playing as ${view.name}, a guest. Pick a username to keep this captain and log in from any device.`);
    const create = this.form('Create account', 'Keep my captain', 'new-password', (u, p) => this.actions.register(u, p));
    const login = this.form('Log in', 'Log in', 'current-password', (u, p) => this.actions.login(u, p));
    const warn = el('p', 'ac-note', 'Logging in switches to that captain. This guest stays on this device, and logging out brings it back.');
    login.append(warn);
    if (!view.online) intro.textContent += ' (Offline: accounts are saved on this device only.)';
    return [intro, create, login];
  }

  private form(title: string, submit: string, autocomplete: string, run: (username: string, password: string) => Promise<void>): HTMLFormElement {
    const form = el('form', 'ac-form');
    form.noValidate = true;
    const username = this.field('Username', 'text', 'username', USERNAME_HINT);
    const password = this.field('Password', 'password', autocomplete, PASSWORD_HINT);
    username.input.maxLength = ACCOUNTS.usernameMaxLength;
    password.input.maxLength = ACCOUNTS.passwordMaxLength;
    const error = el('p', 'ac-error');
    error.setAttribute('role', 'alert');
    const button = el('button', 'bp-action ac-submit', submit);
    button.type = 'submit';
    form.append(el('h3', 'ac-title', title), username.label, password.label, error, button);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (this.busy) return;
      const name = username.input.value.trim();
      const secret = password.input.value;
      // Quick checks before asking the server, which checks again and has the last word.
      const problem = !USERNAME.test(name) ? `Usernames use ${USERNAME_HINT}.` : secret.length < ACCOUNTS.passwordMinLength || secret.length > ACCOUNTS.passwordMaxLength ? `Passwords need ${PASSWORD_HINT}.` : '';
      if (problem) {
        error.textContent = problem;
        return;
      }
      this.busy = true;
      button.disabled = true;
      error.textContent = '';
      run(name, secret)
        .catch((e: unknown) => {
          error.textContent = e instanceof Error ? e.message : 'Something went wrong. Try again.';
        })
        .finally(() => {
          this.busy = false;
          button.disabled = false;
        });
    });
    return form;
  }

  private field(text: string, type: string, autocomplete: string, hint: string): { label: HTMLLabelElement; input: HTMLInputElement } {
    const label = el('label', 'ac-field');
    const input = el('input', 'ac-input');
    input.type = type;
    input.autocomplete = autocomplete as AutoFill;
    input.spellcheck = false;
    input.autocapitalize = 'off';
    label.append(el('span', 'ac-label', text), input, el('span', 'ac-hint', hint));
    return { label, input };
  }
}
